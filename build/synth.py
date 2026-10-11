"""Render RuneScape synth sound effects to PCM, ported from the OSRS client (SoundEffect, Instrument, SoundEnvelope, AudioFilter).

Integer math follows Java's 32-bit wraparound and truncating division, so the output matches the game.
"""
import math
import struct
import wave

from osrs_cache import Reader

SAMPLE_RATE = 22050
MAX_INSTRUMENTS = 10
MAX_OSCILLATORS = 5


def i32(value):
    return ((value + 0x80000000) & 0xFFFFFFFF) - 0x80000000


def java_div(numerator, denominator):
    quotient = abs(numerator) // abs(denominator)
    return quotient if (numerator >= 0) == (denominator > 0) else -quotient


def _java_random_noise():
    seed = (0 ^ 0x5DEECE66D) & ((1 << 48) - 1)
    noise = []
    for _ in range(32768):
        seed = (seed * 0x5DEECE66D + 0xB) & ((1 << 48) - 1)
        noise.append((i32(seed >> 16) & 2) - 1)
    return noise


NOISE = _java_random_noise()
SINE = [int(math.sin(i / 5215.1903) * 16384.0) for i in range(32768)]


class Envelope:
    def __init__(self):
        self.segments = 2
        self.durations = [0, 65535]
        self.phases = [0, 65535]
        self.form = self.start = self.end = 0
        self.reset()

    def decode(self, reader):
        self.form = reader.u8()
        self.start = reader.i32()
        self.end = reader.i32()
        self.decode_segments(reader)

    def decode_segments(self, reader):
        self.segments = reader.u8()
        self.durations, self.phases = [], []
        for _ in range(self.segments):
            self.durations.append(reader.u16())
            self.phases.append(reader.u16())

    def reset(self):
        self.ticks = self.phase_index = self.delta = self.amplitude = self.position = 0

    def next(self, period):
        if self.position >= self.ticks:
            self.amplitude = self.phases[self.phase_index] << 15
            self.phase_index += 1
            if self.phase_index >= self.segments:
                self.phase_index = self.segments - 1
            self.ticks = int(self.durations[self.phase_index] / 65536.0 * period)
            if self.ticks > self.position:
                self.delta = java_div((self.phases[self.phase_index] << 15) - self.amplitude, self.ticks - self.position)
        self.amplitude = i32(self.amplitude + self.delta)
        self.position += 1
        return i32(self.amplitude - self.delta) >> 15


class Filter:
    def __init__(self):
        self.pairs = [0, 0]
        self.frequencies = [[[0] * 4 for _ in range(2)] for _ in range(2)]
        self.magnitudes = [[[0] * 4 for _ in range(2)] for _ in range(2)]
        self.unity = [0, 0]
        self.coefficients = [[0] * 8, [0] * 8]
        self.forward_multiplier = 0

    def decode(self, reader, envelope):
        packed = reader.u8()
        self.pairs = [packed >> 4, packed & 15]
        if not packed:
            self.unity = [0, 0]
            return
        self.unity = [reader.u16(), reader.u16()]
        migrated = reader.u8()
        for direction in range(2):
            for pair in range(self.pairs[direction]):
                self.frequencies[direction][0][pair] = reader.u16()
                self.magnitudes[direction][0][pair] = reader.u16()
        for direction in range(2):
            for pair in range(self.pairs[direction]):
                if migrated & (1 << (direction * 4) << pair):
                    self.frequencies[direction][1][pair] = reader.u16()
                    self.magnitudes[direction][1][pair] = reader.u16()
                else:
                    self.frequencies[direction][1][pair] = self.frequencies[direction][0][pair]
                    self.magnitudes[direction][1][pair] = self.magnitudes[direction][0][pair]
        if migrated or self.unity[1] != self.unity[0]:
            envelope.decode_segments(reader)

    def _magnitude(self, direction, pair, t):
        value = self.magnitudes[direction][0][pair] + t * (self.magnitudes[direction][1][pair] - self.magnitudes[direction][0][pair])
        return 1.0 - math.pow(10.0, -value * 0.0015258789 / 20.0)

    def _phase(self, direction, pair, t):
        value = self.frequencies[direction][0][pair] + t * (self.frequencies[direction][1][pair] - self.frequencies[direction][0][pair])
        return 32.703197 * math.pow(2.0, value * 1.2207031e-4) * math.pi / 11025.0

    def compute(self, direction, t):
        if direction == 0:
            gain = math.pow(0.1, (self.unity[0] + (self.unity[1] - self.unity[0]) * t) * 0.0030517578 / 20.0)
            self.forward_multiplier = int(gain * 65536.0)
        pairs = self.pairs[direction]
        if not pairs:
            return 0
        values = [0.0] * 8
        radius = self._magnitude(direction, 0, t)
        values[0] = -2.0 * radius * math.cos(self._phase(direction, 0, t))
        values[1] = radius * radius
        for pair in range(1, pairs):
            radius = self._magnitude(direction, pair, t)
            linear = -2.0 * radius * math.cos(self._phase(direction, pair, t))
            square = radius * radius
            values[pair * 2 + 1] = values[pair * 2 - 1] * square
            values[pair * 2] = values[pair * 2 - 1] * linear + values[pair * 2 - 2] * square
            for k in range(pair * 2 - 1, 1, -1):
                values[k] += values[k - 1] * linear + values[k - 2] * square
            values[1] += values[0] * linear + square
            values[0] += linear
        if direction == 0:
            values = [v * gain for v in values]
        self.coefficients[direction] = [int(v * 65536.0) for v in values]
        return pairs * 2


def _wave(phase, amplitude, form):
    if form == 1:
        return amplitude if (phase & 32767) < 16384 else -amplitude
    if form == 2:
        return i32(SINE[phase & 32767] * amplitude) >> 14
    if form == 3:
        return (i32(amplitude * (phase & 32767)) >> 14) - amplitude
    if form == 4:
        return i32(amplitude * NOISE[java_div(phase, 2607) & 32767])
    return 0


class Instrument:
    def __init__(self):
        self.pitch = self.volume = None
        self.pitch_modifier = self.pitch_modifier_amplitude = None
        self.volume_multiplier = self.volume_multiplier_amplitude = None
        self.release = self.attack = None
        self.oscillator_volume = [0] * MAX_OSCILLATORS
        self.oscillator_pitch = [0] * MAX_OSCILLATORS
        self.oscillator_delay = [0] * MAX_OSCILLATORS
        self.delay_time = 0
        self.delay_decay = 100
        self.duration = 500
        self.offset = 0
        self.filter = Filter()
        self.filter_envelope = Envelope()

    def decode(self, reader):
        self.pitch = _envelope(reader)
        self.volume = _envelope(reader)
        if reader.peek():
            self.pitch_modifier, self.pitch_modifier_amplitude = _envelope(reader), _envelope(reader)
        else:
            reader.u8()
        if reader.peek():
            self.volume_multiplier, self.volume_multiplier_amplitude = _envelope(reader), _envelope(reader)
        else:
            reader.u8()
        if reader.peek():
            self.release, self.attack = _envelope(reader), _envelope(reader)
        else:
            reader.u8()
        for index in range(10):
            volume = reader.unsigned_short_smart()
            if volume == 0:
                break
            self.oscillator_volume[index] = volume
            self.oscillator_pitch[index] = reader.short_smart()
            self.oscillator_delay[index] = reader.unsigned_short_smart()
        self.delay_time = reader.unsigned_short_smart()
        self.delay_decay = reader.unsigned_short_smart()
        self.duration = reader.u16()
        self.offset = reader.u16()
        self.filter.decode(reader, self.filter_envelope)

    def synthesize(self, count, duration):
        samples = [0] * count
        if duration < 10:
            return samples
        scale = count / (duration + 0.0)
        self.pitch.reset()
        self.volume.reset()
        modifier_rate = modifier_base = modifier_phase = 0
        if self.pitch_modifier:
            self.pitch_modifier.reset()
            self.pitch_modifier_amplitude.reset()
            modifier_rate = int((self.pitch_modifier.end - self.pitch_modifier.start) * 32.768 / scale)
            modifier_base = int(self.pitch_modifier.start * 32.768 / scale)
        multiplier_rate = multiplier_base = multiplier_phase = 0
        if self.volume_multiplier:
            self.volume_multiplier.reset()
            self.volume_multiplier_amplitude.reset()
            multiplier_rate = int((self.volume_multiplier.end - self.volume_multiplier.start) * 32.768 / scale)
            multiplier_base = int(self.volume_multiplier.start * 32.768 / scale)
        oscillators = []
        for index in range(MAX_OSCILLATORS):
            if self.oscillator_volume[index]:
                oscillators.append([
                    0,
                    int(self.oscillator_delay[index] * scale),
                    (self.oscillator_volume[index] << 14) // 100,
                    int((self.pitch.end - self.pitch.start) * 32.768 * math.pow(1.0057929410678534, self.oscillator_pitch[index]) / scale),
                    int(self.pitch.start * 32.768 / scale),
                ])
        for index in range(count):
            pitch = self.pitch.next(count)
            volume = self.volume.next(count)
            if self.pitch_modifier:
                rate = self.pitch_modifier.next(count)
                depth = self.pitch_modifier_amplitude.next(count)
                pitch = i32(pitch + (_wave(modifier_phase, depth, self.pitch_modifier.form) >> 1))
                modifier_phase = i32(modifier_phase + modifier_base + (i32(rate * modifier_rate) >> 16))
            if self.volume_multiplier:
                rate = self.volume_multiplier.next(count)
                depth = self.volume_multiplier_amplitude.next(count)
                volume = i32(volume * ((_wave(multiplier_phase, depth, self.volume_multiplier.form) >> 1) + 32768)) >> 15
                multiplier_phase = i32(multiplier_phase + multiplier_base + (i32(rate * multiplier_rate) >> 16))
            for oscillator in oscillators:
                position = oscillator[1] + index
                if position < count:
                    samples[position] = i32(samples[position] + _wave(oscillator[0], i32(volume * oscillator[2]) >> 15, self.pitch.form))
                    oscillator[0] = i32(oscillator[0] + (i32(pitch * oscillator[3]) >> 16) + oscillator[4])
        if self.release:
            self.release.reset()
            self.attack.reset()
            counter = 0
            muted = True
            for index in range(count):
                release = self.release.next(count)
                attack = self.attack.next(count)
                step = release if muted else attack
                threshold = (i32(step * (self.release.end - self.release.start)) >> 8) + self.release.start
                counter += 256
                if counter >= threshold:
                    counter = 0
                    muted = not muted
                if muted:
                    samples[index] = 0
        if self.delay_time > 0 and self.delay_decay > 0:
            delay = int(self.delay_time * scale)
            for index in range(delay, count):
                samples[index] = i32(samples[index] + java_div(i32(samples[index - delay] * self.delay_decay), 100))
        if self.filter.pairs[0] > 0 or self.filter.pairs[1] > 0:
            self._apply_filter(samples, count)
        return [max(-32768, min(32767, s)) for s in samples]

    def _apply_filter(self, samples, count):
        envelope, audio_filter = self.filter_envelope, self.filter
        envelope.reset()
        t = envelope.next(count + 1)
        forward = audio_filter.compute(0, t / 65536.0)
        backward = audio_filter.compute(1, t / 65536.0)
        if count < forward + backward:
            return

        def filtered(index, forward, backward, history):
            value = 0 if index >= count - forward else int(samples[index + forward] * audio_filter.forward_multiplier) >> 16
            low = index + forward - count if index >= count - forward else 0
            coefficients = audio_filter.coefficients
            for k in range(low, forward):
                value += int(samples[index + forward - 1 - k] * coefficients[0][k]) >> 16
            for k in range(history):
                value -= int(samples[index - 1 - k] * coefficients[1][k]) >> 16
            return i32(value)

        index = 0
        limit = min(backward, count - forward)
        while index < limit:
            samples[index] = filtered(index, forward, backward, index)
            t = envelope.next(count + 1)
            index += 1
        limit = 128
        while True:
            limit = min(limit, count - forward)
            while index < limit:
                samples[index] = filtered(index, forward, backward, backward)
                t = envelope.next(count + 1)
                index += 1
            if index >= count - forward:
                while index < count:
                    samples[index] = filtered(index, forward, backward, backward)
                    envelope.next(count + 1)
                    index += 1
                return
            forward = audio_filter.compute(0, t / 65536.0)
            backward = audio_filter.compute(1, t / 65536.0)
            limit += 128


def _envelope(reader):
    envelope = Envelope()
    envelope.decode(reader)
    return envelope


def render(data):
    """Signed 8-bit samples at 22050 Hz, mixed the way SoundEffect.mix does."""
    reader = Reader(data)
    instruments = []
    for _ in range(MAX_INSTRUMENTS):
        if reader.peek():
            instrument = Instrument()
            instrument.decode(reader)
            instruments.append(instrument)
        else:
            reader.u8()
    lead = min((i.offset for i in instruments), default=0) // 20 * 20
    for instrument in instruments:
        instrument.offset -= lead
    length_ms = max((i.duration + i.offset for i in instruments), default=0)
    mixed = [0] * (length_ms * SAMPLE_RATE // 1000)
    for instrument in instruments:
        count = instrument.duration * SAMPLE_RATE // 1000
        start = instrument.offset * SAMPLE_RATE // 1000
        for index, sample in enumerate(instrument.synthesize(count, instrument.duration)):
            value = (sample >> 8) + mixed[index + start]
            if (value + 128) & -256:
                value = (value >> 31) ^ 127
            mixed[index + start] = value
    return mixed


def write_wav(samples, path):
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(1)
        out.setframerate(SAMPLE_RATE)
        out.writeframes(bytes((s + 128) & 0xFF for s in samples))
