import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn utility function', () => {
    it('should merge class names correctly', () => {
        expect(cn('foo', 'bar')).toBe('foo bar');
    });

    it('should handle conditional classes', () => {
        expect(cn('base', false && 'hidden', true && 'visible')).toBe('base visible');
    });

    it('should merge Tailwind classes correctly', () => {
        // tw-merge should handle conflicting Tailwind classes
        expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
    });

    it('should handle array of class names', () => {
        expect(cn(['foo', 'bar'])).toBe('foo bar');
    });

    it('should handle undefined and null values', () => {
        expect(cn('base', undefined, null, 'end')).toBe('base end');
    });

    it('should handle empty strings', () => {
        expect(cn('base', '', 'end')).toBe('base end');
    });

    it('should handle object syntax', () => {
        expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz');
    });

    it('should handle complex Tailwind conflicts', () => {
        expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
        expect(cn('bg-primary', 'bg-secondary')).toBe('bg-secondary');
    });

    it('should preserve non-conflicting classes', () => {
        expect(cn('rounded-lg', 'shadow-md', 'border')).toBe('rounded-lg shadow-md border');
    });
});
