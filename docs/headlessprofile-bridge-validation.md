# HeadlessProfile Bridge Validation

Recognized HeadlessProfile bridge fields must include values.

A recognized bridge field with no value is reported as malformed, not skipped.

The resolver scans the full TXT set before returning the malformed result. This keeps diagnostics stable when DNS TXT order varies. HeadlessProfile bridge records are included in the malformed diagnostic, while unrelated TXT records remain in ignored diagnostics.
