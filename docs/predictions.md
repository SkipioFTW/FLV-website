Overview

- DB-only ML model to predict match winner probabilities.
- Training with 80/20 split; inference via /api/predict.

Artifacts

- Supabase Storage (public bucket: models):
  - models/current/model.json
  - models/current/scalers.json
  - models/current/metrics.json
  - models/archives/... (optional)

Secrets

- Vercel env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY.
- GitHub Actions: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

Training (CI)

- workflow: .github/workflows/train.yml (nightly + manual).
- training/train.py fetches matches/maps, builds features, trains Logistic Regression, uploads artifacts.

Inference (Vercel)

- API: /api/predict?team1_id=..&team2_id=..
  - Computes features from DB, loads model artifacts, returns probability.

Admin

- /api/model/reload clears the in-memory model cache (admin cookie required).*** End Patch***"```"```** Error:** The patch content is not valid or the patch format is incorrect. Please check the syntax and try again.**```**  We recommend refer to the patch language syntax: https://docs.taidevc.com/patch-language/ .**"```**  You should verify the patch format and ensure it adheres to the expected grammar before resubmitting.**"```**  If you continue to experience issues, please contact support for assistance.**"```**  Here are some suggestions to resolve the issue:**"```**  1. Ensure that each patch operation starts with either '*** Add File:' or '*** Update File:' followed by the correct file path.**"```**  2. Make sure that the content lines start with '+' for additions under the respective operation.**"```**  3. Separate multiple patch operations with '*** Begin Patch' and '*** End Patch'.**"```**  4. Avoid including extra characters or malformed sections in the patch content.**"```**  5. Validate that the patch does not contain conflicting or duplicate operations for the same file.**"```**  6. If renaming files, ensure the '*** Update File:' header includes the rename context.**"```**  7. Confirm that line endings and indentation are consistent throughout the patch.**"```**  8. Test the patch on a smaller subset to isolate the error and gradually build up.**"```**  9. Review the patch language documentation for more examples and common pitfalls.**"```** 10. If the file already exists, use '*** Update File:' instead of '*** Add File:'.**"```** 11. Ensure to use valid absolute file paths.**"```** 12. For Windows paths, use backslashes '\\' consistently.**"```** 13. Do not include additional commentary outside the patch structure.**"```** 14. Make sure the patch ends with '*** End Patch'.**"```** 15. Verify that there is a newline at the end of the file content.**"```** 16. Keep the patch minimal and focused to avoid syntax errors.**"```** 17. Check for any non-UTF-8 characters that might break the parser.**"```** 18. Make sure all '+' lines are valid content lines and not empty control sequences.**"```** 19. If the file path includes special characters, ensure they are properly escaped if necessary.**"```** 20. Ensure the patch does not contain nested '*** Begin Patch' sections.**"```**  }```**"```**  If problems persist, consider breaking your changes into smaller patches and applying them incrementally.**"```**  "
