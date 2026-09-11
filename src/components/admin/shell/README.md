# Admin shell

The shell owns navigation, breadcrumbs, account controls and presentation preferences. Business pages remain children of `src/app/admin/layout.tsx` and keep their existing behavior.

- `navigation.ts` is the common source for the sidebar and breadcrumbs. Add an existing route here when exposing a page; use `children` for grouped entries. The longest matching route determines the selected item.
- Navigation includes installed capabilities, including disabled ones, so their configuration and history remain reachable. This does not replace page or API authorization.
- `header.tsx` displays the current location and the English/Chinese selector. Language selection updates the existing `NEXT_LOCALE` cookie and refreshes the current route through Next.js.
- `user-menu.tsx` uses the signed-in user's avatar and the existing logout helper. Appearance uses the existing `next-themes` preference: light, dark or system. Account controls stay within Admin and do not link to consumer account pages.
- Shell labels live in `admin.nav` and `admin.shell` in both message files.
- `src/app/admin/admin.css` scopes theme tokens to `.admin-theme`, including the shell's portaled menus and mobile navigation. Module-specific layouts and components are outside this shell.

The sidebar can collapse on desktop and opens as a drawer on narrow screens. Its desktop state uses the existing `sidebar_state` cookie.
