# Image credits — landing page visual refresh

None of the photography below shows a real Brasaland dish, location, or
staff member. Every image is **licensed stock photography** used as a
temporary stand-in, served directly from Unsplash's CDN (no local copy
checked into this repo). **Replace every entry in this table with real
Brasaland photography before this redesign ships** — that is the single
most important follow-up from this visual refresh.

All images are from [Unsplash](https://unsplash.com), used under the
[Unsplash License](https://unsplash.com/license) (free to use for
commercial and non-commercial purposes, no permission or attribution
required — attribution given below anyway, as good practice).

| Used in | Unsplash photo ID | Depicts | Swap for real photo of... |
| --- | --- | --- | --- |
| `HeroSection` (hero image) | `photo-1555939594-58d7cb561ad1` | Mixed grilled skewers, chicken, lamb chops and vegetables on a dark wood board | A real hero shot of Brasaland's grill/parrilla in action, or a flagship plate |
| `FeaturedDishes` (card 1 — Churrasco Medellín) | `photo-1432139509613-5c4255815697` | Grilled bone-in steak with red wine jus and broccolini | Brasaland's actual Churrasco as served in Medellín |
| `FeaturedDishes` (card 2 — Churrasco Bogotá) | `photo-1544025162-d76694265947` | Grilled ribs plate with fries, pickles, tomato and BBQ sauce | Brasaland's actual Churrasco as served in Bogotá |
| `FeaturedDishes` (card 3 — Churrasco Miami) | `photo-1529692236671-f1f6cf9683ba` | Close-up of a fork and knife cutting into a grilled, sliced steak | Brasaland's actual Churrasco as served in Miami |
| `OurStory` (unchanged, pre-existing — not added in this refresh) | `photo-1558030006-450675393462` | Grilled meats served on a wooden table | Brasaland's own kitchen/preparation |

Every `<Image>` using one of these URLs has an honest, generic `alt` —
describing what the photo actually shows, never asserting it's a real
Brasaland location or dish (per this refresh's explicit direction: never
present stock photography as if it were real Brasaland food/premises).

Dish **names and prices** on the `FeaturedDishes` cards are real existing
data from `services/api/seed_inventory.py`'s `SEED_PRODUCTS` (the
`MenuItem` seed fixture) — not invented. Only the photography is a
placeholder.
