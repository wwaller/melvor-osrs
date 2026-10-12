# TODO

- Textured faces (crystal gear, some capes) draw as flat grey. Decode cache textures (index 9) and use each texture's average colour, or map the textures properly.
- Weapons with their own idle stance (two-handers, staffs, bows) are drawn in the default standing pose (808). OSRS item definitions do not carry the stance, so it needs a source such as the OSRS Wiki's crowdsourced idle pose per weapon.
- Agility and alt magic are the only remaining skills with OSRS counterparts (OSRS has an animation per agility obstacle, and High Alchemy, Superheat and enchanting each have their own). Prayer (bone burying is instant), farming and the skills OSRS doesn't have stay on the standing pose on purpose.
- Combat uses the default standing pose between attacks. OSRS weapons have their own stances (two-handers, staffs, bows); like the idle stance, they are not in the item definitions.
- Coverage follows the OSRS Sprites mod: gear only appears when that mod maps it to an OSRS item, so most expansion gear shows the bare body. See build/report.md.
