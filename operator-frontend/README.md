# Operator frontend deployment

This is a separate static Vercel project root for `operator.primetaskworkspace.com`.
Configure the Vercel project root directory as `operator-frontend`; do not copy the
member project's `.vercel/project.json` or its environment files. Its `/api/*`
rewrite targets the existing PrimeTask backend. The member frontend remains in
`frontend/` and uses the same backend through its own `/api/*` rewrite.

Operator pages are the existing HTML/CSS/JavaScript administration pages moved
from `frontend/dashboard/admin/` and the service-specific `admin/` directories.
An initial session check redirects unauthenticated/member accounts. The backend
is the authority for every administrative API and role permission.

Production backend configuration must allow both HTTPS portal origins and set
`PTW_COOKIE_DOMAIN=.primetaskworkspace.com`; apply those settings through the
backend hosting configuration without replacing unrelated environment values.
No deployment is performed by this repository change.