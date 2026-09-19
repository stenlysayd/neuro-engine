# Security Policy

## Reporting Vulnerabilities

We take the security of Neuro Engine seriously, particularly because the system handles sensitive API credentials and cryptographic operations.

**Do not file public GitHub issues for security vulnerabilities or key exposure concerns.**

Instead, please report security issues privately via email to **stenlysayd@gmail.com** with:
- A detailed summary of the vulnerability.
- Steps to reproduce or a minimal proof-of-concept.
- Potential impact on key leakage, unauthorized execution, or data exposure.

You will receive an acknowledgment within 48 hours, along with a remediation timeline.

---

## Security Architecture & Best Practices

Neuro Engine is engineered with multiple defensive layers:

1. **At-Rest Encryption:**
   - All third-party API credentials stored in SQLite are encrypted using **AES-256-CBC** with a unique Initialization Vector (`IV`) per key.
   - The master key is never persisted in the database; it must be supplied at runtime via the `MASTER_KEY` environment variable.

2. **Secret Masking & Zero-Leak APIs:**
   - The internal API and telemetry events never return raw secrets to the frontend.
   - Keys are masked (`sk-ant-***...3a9f`) and identified via cryptographically salted hashes/fingerprints.

3. **Rate Limiting & Lease Cooldown:**
   - Keys experiencing `429 (Too Many Requests)` or `401 (Unauthorized)` errors are automatically placed on temporary quarantine cooldown to prevent cascade account suspensions.

4. **Environment Isolation:**
   - Database files (`data/*.db`) and audio cache files (`data/audio-cache/`) are strictly gitignored to prevent accidental commits of local runtime data.
