# Security Policy

## Scope & Trading Safety Notice

**Pro-Charts** connects directly to your local **MetaTrader 5** terminal via Python IPC and executes real or demo orders when you explicitly trigger chart trading actions.

- Always test new strategies, Pine Script indicators, and broker connections on a **Demo Account** first.
- Never commit `.env` files, MetaTrader 5 account passwords, broker credentials, or local `backend/data/` databases to public repositories.
- By default, the backend binds locally (`localhost:8000`). Do not expose the FastAPI backend to the public internet without proper authentication, TLS, and firewall restrictions.

## Supported Versions

| Version | Supported |
| :--- | :--- |
| `2.5.x` | Yes |
| `< 2.5.0` | No — please update to the latest `main` branch |

## Reporting a Vulnerability

If you discover a security vulnerability (for example, arbitrary code execution via Pine Script parsing, credential leakage, or unsafe order execution):

1. **Do not** open a public GitHub issue with exploit details.
2. Use GitHub's **Security Advisories** ("Report a vulnerability" under the **Security** tab) or contact the maintainer via their [GitHub profile](https://github.com/daffatahtaa).
3. Include steps to reproduce, affected files, and suggested remediation if available.

We aim to acknowledge reports within 72 hours and ship fixes promptly.
