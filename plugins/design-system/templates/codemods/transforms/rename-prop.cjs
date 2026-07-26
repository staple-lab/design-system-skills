'use strict';

/**
 * Renames a prop on a named JSX component.
 *
 *   npm run codemod -- rename-prop src/ --component=Button --from=leftIcon --to=startIcon
 *
 * Matches `<Button leftIcon={…}>` and `<DS.Button leftIcon>`; leaves `<button>` alone
 * (lowercase names are DOM elements, not components).
 *
 * What this does NOT catch — grep for the old name after running:
 *   - spread props: `<Button {...props}>` where `props.leftIcon` is set elsewhere
 *   - aliased imports: `import { Button as Btn }` then `<Btn leftIcon>`
 *   - object literals passed to helpers that eventually reach the component
 */
module.exports = function renameProp(file, api, options) {
  const j = api.jscodeshift;
  const { component, from, to } = options;

  if (!component || !from || !to) {
    throw new Error('rename-prop requires --component=<Name> --from=<oldProp> --to=<newProp>');
  }

  const root = j(file.source);
  let changed = 0;

  root
    .find(j.JSXOpeningElement)
    .filter((path) => {
      const name = path.node.name;
      if (name.type === 'JSXIdentifier') return name.name === component;
      if (name.type === 'JSXMemberExpression') return name.property.name === component;
      return false;
    })
    .forEach((path) => {
      for (const attr of path.node.attributes ?? []) {
        if (attr.type === 'JSXAttribute' && attr.name.type === 'JSXIdentifier' && attr.name.name === from) {
          attr.name.name = to;
          changed += 1;
        }
      }
    });

  // null = "untouched" — jscodeshift leaves the file byte-identical instead of
  // reprinting it, which keeps the diff to exactly the intended change.
  return changed ? root.toSource({ quote: 'single' }) : null;
};

module.exports.parser = 'tsx';
