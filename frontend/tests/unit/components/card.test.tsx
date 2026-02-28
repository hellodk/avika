import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
    Card,
    CardHeader,
    CardFooter,
    CardTitle,
    CardDescription,
    CardContent,
    CardAction,
} from '@/components/ui/card';

describe('Card components', () => {
    describe('Card', () => {
        it('should render a div element', () => {
            render(<Card data-testid="card">Content</Card>);
            const card = screen.getByTestId('card');
            expect(card.tagName).toBe('DIV');
        });

        it('should have data-slot attribute', () => {
            render(<Card data-testid="card">Content</Card>);
            const card = screen.getByTestId('card');
            expect(card).toHaveAttribute('data-slot', 'card');
        });

        it('should render children', () => {
            render(<Card>Card Content</Card>);
            expect(screen.getByText('Card Content')).toBeInTheDocument();
        });

        it('should apply custom className', () => {
            render(<Card className="custom-class" data-testid="card">Content</Card>);
            const card = screen.getByTestId('card');
            expect(card).toHaveClass('custom-class');
        });

        it('should have default styling classes', () => {
            render(<Card data-testid="card">Content</Card>);
            const card = screen.getByTestId('card');
            expect(card).toHaveClass('bg-card');
            expect(card).toHaveClass('rounded-xl');
            expect(card).toHaveClass('border');
        });
    });

    describe('CardHeader', () => {
        it('should render with data-slot attribute', () => {
            render(<CardHeader data-testid="header">Header</CardHeader>);
            const header = screen.getByTestId('header');
            expect(header).toHaveAttribute('data-slot', 'card-header');
        });

        it('should render children', () => {
            render(<CardHeader>Header Content</CardHeader>);
            expect(screen.getByText('Header Content')).toBeInTheDocument();
        });

        it('should apply custom className', () => {
            render(<CardHeader className="custom-header" data-testid="header">Header</CardHeader>);
            const header = screen.getByTestId('header');
            expect(header).toHaveClass('custom-header');
        });
    });

    describe('CardTitle', () => {
        it('should render with data-slot attribute', () => {
            render(<CardTitle data-testid="title">Title</CardTitle>);
            const title = screen.getByTestId('title');
            expect(title).toHaveAttribute('data-slot', 'card-title');
        });

        it('should render children', () => {
            render(<CardTitle>My Title</CardTitle>);
            expect(screen.getByText('My Title')).toBeInTheDocument();
        });

        it('should have font-semibold class', () => {
            render(<CardTitle data-testid="title">Title</CardTitle>);
            const title = screen.getByTestId('title');
            expect(title).toHaveClass('font-semibold');
        });
    });

    describe('CardDescription', () => {
        it('should render with data-slot attribute', () => {
            render(<CardDescription data-testid="description">Description</CardDescription>);
            const description = screen.getByTestId('description');
            expect(description).toHaveAttribute('data-slot', 'card-description');
        });

        it('should render children', () => {
            render(<CardDescription>My Description</CardDescription>);
            expect(screen.getByText('My Description')).toBeInTheDocument();
        });

        it('should have muted text styling', () => {
            render(<CardDescription data-testid="description">Description</CardDescription>);
            const description = screen.getByTestId('description');
            expect(description).toHaveClass('text-muted-foreground');
            expect(description).toHaveClass('text-sm');
        });
    });

    describe('CardContent', () => {
        it('should render with data-slot attribute', () => {
            render(<CardContent data-testid="content">Content</CardContent>);
            const content = screen.getByTestId('content');
            expect(content).toHaveAttribute('data-slot', 'card-content');
        });

        it('should render children', () => {
            render(<CardContent>Card Body Content</CardContent>);
            expect(screen.getByText('Card Body Content')).toBeInTheDocument();
        });

        it('should have padding class', () => {
            render(<CardContent data-testid="content">Content</CardContent>);
            const content = screen.getByTestId('content');
            expect(content).toHaveClass('px-6');
        });
    });

    describe('CardFooter', () => {
        it('should render with data-slot attribute', () => {
            render(<CardFooter data-testid="footer">Footer</CardFooter>);
            const footer = screen.getByTestId('footer');
            expect(footer).toHaveAttribute('data-slot', 'card-footer');
        });

        it('should render children', () => {
            render(<CardFooter>Footer Content</CardFooter>);
            expect(screen.getByText('Footer Content')).toBeInTheDocument();
        });

        it('should have flex styling', () => {
            render(<CardFooter data-testid="footer">Footer</CardFooter>);
            const footer = screen.getByTestId('footer');
            expect(footer).toHaveClass('flex');
            expect(footer).toHaveClass('items-center');
        });
    });

    describe('CardAction', () => {
        it('should render with data-slot attribute', () => {
            render(<CardAction data-testid="action">Action</CardAction>);
            const action = screen.getByTestId('action');
            expect(action).toHaveAttribute('data-slot', 'card-action');
        });

        it('should render children', () => {
            render(<CardAction>Action Button</CardAction>);
            expect(screen.getByText('Action Button')).toBeInTheDocument();
        });
    });

    describe('Card composition', () => {
        it('should render a complete card with all components', () => {
            render(
                <Card data-testid="card">
                    <CardHeader>
                        <CardTitle>Test Title</CardTitle>
                        <CardDescription>Test Description</CardDescription>
                        <CardAction>
                            <button>Action</button>
                        </CardAction>
                    </CardHeader>
                    <CardContent>
                        <p>Main content goes here</p>
                    </CardContent>
                    <CardFooter>
                        <button>Footer Button</button>
                    </CardFooter>
                </Card>
            );

            expect(screen.getByText('Test Title')).toBeInTheDocument();
            expect(screen.getByText('Test Description')).toBeInTheDocument();
            expect(screen.getByText('Main content goes here')).toBeInTheDocument();
            expect(screen.getByText('Footer Button')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /action/i })).toBeInTheDocument();
        });
    });
});
