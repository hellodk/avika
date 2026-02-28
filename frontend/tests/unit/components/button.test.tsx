import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button, buttonVariants } from '@/components/ui/button';

describe('Button component', () => {
    describe('rendering', () => {
        it('should render a button element by default', () => {
            render(<Button>Click me</Button>);
            const button = screen.getByRole('button', { name: /click me/i });
            expect(button).toBeInTheDocument();
            expect(button.tagName).toBe('BUTTON');
        });

        it('should render children correctly', () => {
            render(<Button>Test Button</Button>);
            expect(screen.getByText('Test Button')).toBeInTheDocument();
        });

        it('should have data-slot attribute', () => {
            render(<Button>Button</Button>);
            const button = screen.getByRole('button');
            expect(button).toHaveAttribute('data-slot', 'button');
        });
    });

    describe('variants', () => {
        it('should render with default variant', () => {
            render(<Button>Default</Button>);
            const button = screen.getByRole('button');
            expect(button).toHaveAttribute('data-variant', 'default');
        });

        it('should render with destructive variant', () => {
            render(<Button variant="destructive">Delete</Button>);
            const button = screen.getByRole('button');
            expect(button).toHaveAttribute('data-variant', 'destructive');
        });

        it('should render with outline variant', () => {
            render(<Button variant="outline">Outline</Button>);
            const button = screen.getByRole('button');
            expect(button).toHaveAttribute('data-variant', 'outline');
        });

        it('should render with secondary variant', () => {
            render(<Button variant="secondary">Secondary</Button>);
            const button = screen.getByRole('button');
            expect(button).toHaveAttribute('data-variant', 'secondary');
        });

        it('should render with ghost variant', () => {
            render(<Button variant="ghost">Ghost</Button>);
            const button = screen.getByRole('button');
            expect(button).toHaveAttribute('data-variant', 'ghost');
        });

        it('should render with link variant', () => {
            render(<Button variant="link">Link</Button>);
            const button = screen.getByRole('button');
            expect(button).toHaveAttribute('data-variant', 'link');
        });
    });

    describe('sizes', () => {
        it('should render with default size', () => {
            render(<Button>Default Size</Button>);
            const button = screen.getByRole('button');
            expect(button).toHaveAttribute('data-size', 'default');
        });

        it('should render with sm size', () => {
            render(<Button size="sm">Small</Button>);
            const button = screen.getByRole('button');
            expect(button).toHaveAttribute('data-size', 'sm');
        });

        it('should render with lg size', () => {
            render(<Button size="lg">Large</Button>);
            const button = screen.getByRole('button');
            expect(button).toHaveAttribute('data-size', 'lg');
        });

        it('should render with icon size', () => {
            render(<Button size="icon">Icon</Button>);
            const button = screen.getByRole('button');
            expect(button).toHaveAttribute('data-size', 'icon');
        });

        it('should render with xs size', () => {
            render(<Button size="xs">XS</Button>);
            const button = screen.getByRole('button');
            expect(button).toHaveAttribute('data-size', 'xs');
        });
    });

    describe('interactions', () => {
        it('should handle click events', () => {
            const handleClick = vi.fn();
            render(<Button onClick={handleClick}>Click</Button>);
            const button = screen.getByRole('button');
            fireEvent.click(button);
            expect(handleClick).toHaveBeenCalledTimes(1);
        });

        it('should not trigger click when disabled', () => {
            const handleClick = vi.fn();
            render(<Button disabled onClick={handleClick}>Disabled</Button>);
            const button = screen.getByRole('button');
            fireEvent.click(button);
            expect(handleClick).not.toHaveBeenCalled();
        });

        it('should be disabled when disabled prop is true', () => {
            render(<Button disabled>Disabled</Button>);
            const button = screen.getByRole('button');
            expect(button).toBeDisabled();
        });
    });

    describe('custom className', () => {
        it('should accept custom className', () => {
            render(<Button className="custom-class">Custom</Button>);
            const button = screen.getByRole('button');
            expect(button).toHaveClass('custom-class');
        });
    });

    describe('type attribute', () => {
        it('should support type="submit"', () => {
            render(<Button type="submit">Submit</Button>);
            const button = screen.getByRole('button');
            expect(button).toHaveAttribute('type', 'submit');
        });

        it('should support type="reset"', () => {
            render(<Button type="reset">Reset</Button>);
            const button = screen.getByRole('button');
            expect(button).toHaveAttribute('type', 'reset');
        });
    });

    describe('buttonVariants function', () => {
        it('should return default variant classes', () => {
            const classes = buttonVariants();
            expect(classes).toContain('bg-primary');
        });

        it('should return destructive variant classes', () => {
            const classes = buttonVariants({ variant: 'destructive' });
            expect(classes).toContain('bg-destructive');
        });

        it('should return small size classes', () => {
            const classes = buttonVariants({ size: 'sm' });
            expect(classes).toContain('h-8');
        });

        it('should return large size classes', () => {
            const classes = buttonVariants({ size: 'lg' });
            expect(classes).toContain('h-10');
        });
    });
});
