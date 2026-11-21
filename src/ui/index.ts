// The UI kit as modules see it, imported as `mwps/ui`: shadcn components
// (Radix underneath), styled by the host. Pass your own class to restyle
// one; module CSS always beats the kit's. Tailwind utility classes are not
// available to modules.
//
// To add a component: `npx shadcn@4.22.1 add <name>`, answering No to
// overwriting existing files; point its `cn` import at `@/ui/lib/utils`
// (the CLI imports the `cn` package, which doesn't know the `tw:` prefix);
// wrap anything it portals in `InModuleScope` (see dialog.tsx, marked
// `mwps:`); export it here. Revert any CSS the CLI appends to kit.css.

export * from './components/badge';
export * from './components/button';
export * from './components/card';
export * from './components/collapsible';
export * from './components/commit-field';
export * from './components/command';
export * from './components/context-menu';
export * from './components/dialog';
export * from './components/hover-card';
export * from './components/input';
export * from './components/label';
export * from './components/menubar';
export * from './components/popover';
export * from './components/resizable';
export * from './components/scroll-area';
export * from './components/select';
export * from './components/separator';
export * from './components/sheet';
export * from './components/sidebar';
export * from './components/skeleton';
export * from './components/slider';
export * from './components/switch';
export * from './components/tabs';
export * from './components/textarea';
export * from './components/toggle';
export * from './components/toggle-group';
export * from './components/tooltip';
