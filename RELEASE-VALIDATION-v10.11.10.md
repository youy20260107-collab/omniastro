# FiveLens v10.11.10 — Accuracy Disclosure UI Update

## Changes
- Removed the large inline 姓名學 helper paragraph under 名字 that consumed form space.
- Added a compact native `<details>` accuracy disclosure immediately after the input form.
- Disclosure is collapsed by default; clicking the summary expands it and clicking again collapses it.
- Added responsive styling for desktop and mobile.
- Kept the existing calculation logic, form IDs, navigation, API logic, and other feature code unchanged.
- Removed the redundant footer precision disclosure block to avoid duplicate long accuracy text.

## Static checks
- HTMLParser parse: PASS
- Accuracy disclosure count: 1
- Old inline 姓名學 helper text: 0 occurrences
- `<details>` / `</details>` in static HTML: balanced for actual markup (template literals also contain generated details strings)
