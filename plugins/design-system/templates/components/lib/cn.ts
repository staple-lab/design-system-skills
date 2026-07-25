import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names, consumer-last.
 *
 * `twMerge` is what makes the escape hatch actually work in Tailwind: without it,
 * `<Button className="p-8">` loses to the component's own `p-4` by CSS source order
 * rather than by intent, and the developer concludes the escape hatch is broken and
 * forks the component. With it, the later class wins because it is later.
 *
 * On a non-Tailwind system this reduces to `clsx` and you can drop the dependency:
 *   export const cn = (...inputs: ClassValue[]) => clsx(inputs);
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
