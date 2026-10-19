import unittest

from naming import item_candidates, lookup_key, monster_candidates


def keys(names):
    return [lookup_key(n) for n in names]


class ItemCandidatesTest(unittest.TestCase):
    def test_exact_name_is_tried_first(self):
        self.assertEqual(item_candidates("Bronze Dagger")[0], "Bronze Dagger")

    def test_normal_prefix_is_dropped(self):
        self.assertIn("logs", keys(item_candidates("Normal Logs")))

    def test_dhide_uses_apostrophe(self):
        self.assertIn("green d'hide body", keys(item_candidates("Green D-hide Body")))

    def test_upgrade_prefix_becomes_suffix_then_base(self):
        candidates = keys(item_candidates("(G) Rune Platebody"))
        self.assertIn("rune platebody (g)", candidates)
        self.assertIn("rune platebody", candidates)
        self.assertLess(candidates.index("rune platebody (g)"), candidates.index("rune platebody"))

    def test_silver_trim_maps_to_osrs_trimmed(self):
        self.assertIn("rune platebody (t)", keys(item_candidates("(S) Rune Platebody")))

    def test_perfect_food_falls_back_to_regular(self):
        self.assertIn("lobster", keys(item_candidates("Lobster (Perfect)")))

    def test_plurals(self):
        self.assertIn("raw shrimps", keys(item_candidates("Raw Shrimp")))
        self.assertIn("raw anchovies", keys(item_candidates("Raw Anchovy")))
        self.assertIn("feather", keys(item_candidates("Feathers")))

    def test_equipment_slot_names(self):
        self.assertIn("bronze full helm", keys(item_candidates("Bronze Helmet")))
        self.assertIn("bronze kiteshield", keys(item_candidates("Bronze Shield")))
        self.assertIn("bronze arrow", keys(item_candidates("Bronze Arrows")))
        self.assertIn("mystic robe top", keys(item_candidates("Mystic Robes")))
        self.assertIn("mystic robe bottom", keys(item_candidates("Mystic Bottoms")))

    def test_ore_and_seeds(self):
        self.assertIn("coal", keys(item_candidates("Coal Ore")))
        self.assertIn("willow seed", keys(item_candidates("Willow Tree Seed")))
        self.assertIn("potato seed", keys(item_candidates("Potato Seeds")))

    def test_potion_tier_becomes_dose(self):
        self.assertIn("attack potion(3)", keys(item_candidates("Attack Potion III")))

    def test_no_duplicates(self):
        candidates = keys(item_candidates("Raw Shrimp"))
        self.assertEqual(len(candidates), len(set(candidates)))


class MonsterCandidatesTest(unittest.TestCase):
    def test_parenthetical_suffix_is_dropped(self):
        self.assertEqual(keys(monster_candidates("Goblin (Level 5)")), ["goblin (level 5)", "goblin"])


if __name__ == "__main__":
    unittest.main()
