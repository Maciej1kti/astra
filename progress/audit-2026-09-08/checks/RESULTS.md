# Interpretation of exploratory runs

Raw JSON preserves actual run outcomes. `pass` means the named assertion/observation completed; it does not mean the feature has no usability defect. In particular, archive disappearance (09), duplicate-tag rejection (33) and layout capture (30) are successful observations of gaps.

| Run / checks | Accepted interpretation |
|---|---|
| `explore.json` 01–12 | 04 dirty Pin, 05 Add type and 06 calendar route fail product expectations. 09 confirms missing archive retrieval while storage remains intact. 10/12 initial captures are superseded by settled visual check 30. |
| `interactions.json` 20–29 | Conflict, validation, Markdown, clean Undo and read receipts pass; 26 Back and 27 mobile sign out fail expectations. 28 measures document width, not complete mobile usability. 29 is invalid as a scope conclusion: it checked absence before establishing a loaded pinned fixture. |
| `followup.json` 30–33 | 30 supplies the final 28 populated screenshots/metrics. 31 fails its setup precondition because the other-project pin was not established by 29; it is not a product finding. 32 proves persisted label splitting. 33 proves unhelpful duplicate-label feedback. |
| `focus-confirm.json` 34 | Establishes and reads the pin through the server, waits for populated Focus, then reproduces the scope mismatch. Supersedes 29/31. |
| `completion.json` 35–37 | 35 successfully creates the milestone but its exact accessible-label locator fails before selecting a relationship; this is a harness issue. 36 actual browser-offline recovery passes. 37 proves Today timezone mismatch. |
| `milestone-confirm.json` 38 | Confirms the previously created milestone exists, selects it by title with a corrected locator, saves and verifies its ID on the card. Completes 35; no app fix was needed. |

Three initial setup attempts failed because the login button's accessible name includes an arrow and the test first checked before initialization. The harness was corrected to wait and match the real label. These attempts produced no completed product scenarios and are not counted as app failures. Setup diagnostics/cookies are retained only in ignored runtime storage.

Do not convert all raw assertion counts into a product pass rate: some checks are observations, some assert proposed usability expectations, and three results are explicitly superseded/corrected above. Runtime pages had no uncaught JavaScript exceptions in these exploratory JSON results. Board CSP inline-style warnings are separately reported. Offline transport failures and conflict responses are intentional in their respective scenarios.
