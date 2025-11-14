# AI Rules for Roomstay Data App

## Tech Stack

- **React 18**: Core UI library with functional components and hooks
- **TypeScript**: For type safety and better developer experience
- **Vite**: Fast build tool and development server
- **Tailwind CSS**: Utility-first CSS framework for styling
- **Supabase**: Backend-as-a-Service for authentication, database, and edge functions
- **React Router**: For client-side routing
- **shadcn/ui**: Component library built on Radix UI primitives
- **React Query**: Data fetching, caching, and state management
- **Recharts**: For data visualization and charts
- **React Hook Form**: Form handling with validation

## Library Usage Guidelines

### UI Components

- **Always use shadcn/ui components** for standard UI elements (buttons, inputs, modals, etc.)
- **Use Radix UI** for accessible primitives when shadcn/ui doesn't provide what you need
- **Use Lucide React** for icons
- **Use Tailwind CSS** for all styling - avoid custom CSS files
- **Use Sonner** for toast notifications

### Data Management

- **Use React Query** for all data fetching, caching, and server state management
- **Use React Hook Form** for all form handling
- **Use Zod** for form validation and type safety

### Supabase Integration

- **Always import the Supabase client** from `@/integrations/supabase/client.ts`
- **Use Row Level Security (RLS)** for all database tables
- **Use Edge Functions** for server-side logic and API-to-API communications
- **Handle authentication** using Supabase Auth

### State Management

- **Use React Query** for server state
- **Use React Context** for global UI state when needed
- **Use React useState/useReducer** for component-level state
- **Avoid Redux** or other complex state management libraries

### Data Visualization

- **Use Recharts** for all charts and graphs
- **Use react-virtuoso** for virtualized lists and tables with large datasets

### File Structure

- **Place components** in `src/components/`
- **Place pages** in `src/pages/`
- **Place hooks** in `src/hooks/`
- **Place utilities** in `src/lib/`
- **Place types** in `src/types/`
- **Place Supabase integration** in `src/integrations/supabase/`

### Performance Optimization

- **Use React.memo** for expensive components
- **Use useMemo and useCallback** for expensive calculations and callbacks
- **Use data-loading-fix.ts** for optimized data loading patterns
- **Use edge functions** for heavy data processing

### Error Handling

- **Use try/catch** for async operations
- **Use error boundaries** for component-level error handling
- **Use toast notifications** for user-facing errors
- **Log errors** to console for debugging

### Testing

- **Write manual test files** in `src/tests/` directory
- **Document test cases** thoroughly
- **Test edge cases** and error scenarios

### Documentation

- **Document complex logic** with comments
- **Use JSDoc** for function documentation
- **Create markdown files** for feature documentation
- **Update README.md** with new features and changes