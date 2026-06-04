# Coding Conventions

> General code style guide beyond the core patterns in CLAUDE.md.

## Common

Follows the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html). Project-specific exceptions are listed below.

### Image Import

Import images instead of using string paths. Next.js rewrites paths at build time.

```tsx
// Bad
;<img src="../assets/image.png" />

// Good
import imageFile from '@/shared/assets/png/image.png'
;<img src={imageFile.src} />
```

---

### Data Validation

```ts
// schemas/user.ts
const UserSchema = z.object({ name: z.string(), age: z.number() })
type User = z.infer<typeof UserSchema> // infer type in the same file
```

## React

### Component Declaration

Use function declarations for components. Use arrow functions for functions inside components.

```ts
// Good
export default function UserCard({ name, age }: Props) {
  const handleClick = () => { ... }
  const formatName = (name: string) => name.trim()

  return <Styled.Container onClick={handleClick}>...</Styled.Container>
}

// Bad — arrow function for component declaration
const UserCard = ({ name, age }: Props) => { ... }
```

---

### Props Type Definition

- Internal use only: `Props`
- Exported or name collision risk: `{ComponentName}Props`
- Prefer `interface`. Do not mix `type` and `interface` in the same file.
- Use `interface` for object shapes, `type` for union/intersection compositions.

```ts
// Good — internal
interface Props {
  title: string
  count: number
  onClose: () => void
}

// Good — exported
interface ButtonProps {
  label: string
  disabled?: boolean
  onClick: () => void
}
```

---

### Event Handler Naming

- Handler function definition: `handle` + verb (+ target)
- When passed as a prop: `on` + verb (+ target)

```ts
// child component — prop declaration uses on
interface Props {
  onConfirm: () => void
}

// parent component — handler defined with handle, passed to on prop
function Parent() {
  const handleConfirm = () => { ... }
  return <Modal onConfirm={handleConfirm} />
}

// Bad
const onConfirm = () => { ... }      // on prefix on implementation function
const confirmHandler = () => { ... } // suffix style
<Modal confirm={handleConfirm} />    // missing on in prop name
```

---

### useState

Specify the generic if the type cannot be inferred from the initial value.

```ts
// Good — inferable → omit
const [isOpen, setIsOpen] = useState(false)
const [name, setName] = useState('')

// Good — includes null or complex type → specify
const [userId, setUserId] = useState<number | null>(null)
const [items, setItems] = useState<Item[]>([])
```

---

### useEffect

Reserved for syncing with external systems or unmount cleanup.

UseEffect must be used only for side-effects that cannot be derived during render:

- external system synchronization (API, storage, DOM, subscriptions)
- lifecycle coordination (mount/unmount, event binding)
- imperative updates outside React render cycle

Allowed patterns

```ts
// Good — external data fetch (async must be declared as inner function)
useEffect(() => {
  const fetchData = async () => {
    const data = await api.getUser(userId)
    setUser(data)
  }
  fetchData()
}, [userId])

// Bad — async callback directly
useEffect(async () => {
  const data = await api.getUser(userId)
}, [userId])

// Good — external subscription
useEffect(() => {
  const unsubscribe = eventBus.subscribe('resize', handleResize)
  return () => unsubscribe()
}, [])

// Good — DOM / external sync
useEffect(() => {
  document.title = title
}, [title])
```

Derived state rule

Do not use useEffect to derive state that can be computed during render.

```ts
// Bad — derived state
useEffect(() => {
  if (!isDiscount) setValue('price.discountPrice', null)
}, [isDiscount])

// Good — derive during render
const discountPrice = isDiscount ? price.discountPrice : null
```

Event-driven updates

Prefer event handlers over effect-based updates when state originates from user interaction.

```ts
// Good
const handleChange = (value: string) => {
  setName(value)
}

// Bad
useEffect(() => {
  setName(inputValue)
}, [inputValue])
```

---

### Conditional Rendering

Use `&&` for simple show/hide, ternary for two branches. Extract to a variable if complex. No nested ternaries.

```ts
// Good
{
  isLoading && <Spinner />
}
{
  isLoggedIn ? <Dashboard /> : <LoginPage />
}

// Good — complex condition extracted to variable
const buttonLabel = isEditing && hasChanged ? 'Save' : 'Edit'

// Bad — nested ternary
{
  isA ? isB ? <A /> : <B /> : <C />
}
```

---

### List Rendering

Always use a unique item id as the `key`.

```ts
// Good
{
  users.map((user) => <UserCard key={user.id} user={user} />)
}

// Bad
{
  users.map((user, index) => <UserCard key={index} user={user} />)
}
```

---

### Custom Hooks

- `use` prefix required.
- Default: return an object.
- Exception: "value + single setter/handler" pattern may return a tuple.

```ts
// Good — object return (multiple values)
export function useUserForm() {
  const [name, setName] = useState('')
  const handleSubmit = () => { ... }
  return { name, setName, handleSubmit }
}

// Good — tuple return (simple toggle)
export function useToggle(initial = false): [boolean, () => void] {
  const [value, setValue] = useState(initial)
  return [value, () => setValue((v) => !v)]
}
```

---

### Memoization

1. General principle

- Only apply after confirming a performance issue (Profiler-based).

2. useMemo

- O(n)+ computation with large or frequently evaluated data.
- Stabilize object/array props passed to `React.memo` children.
- Do not use for referential stability outside of the above.

```ts
// Good — expensive computation
const sorted = useMemo(
  () => [...items].sort((a, b) => b.score - a.score),
  [items],
)

// Good — object props to React.memo child
const style = useMemo(() => ({ color, size }), [color, size])
<MemoizedBlock style={style} />

// Bad — cheap computation
const label = useMemo(() => `${first} ${last}`, [first, last])

// Bad — referential stability unrelated to React.memo
const options = useMemo(() => ({ page, size }), [page, size])
<NormalList options={options} />
```

3. useCallback

- Only when passed to a `React.memo` child or used as a dependency.
- Only when the dependency is stable — unstable dependencies make it ineffective.

```ts
// Good — function passed to React.memo child
const handleSubmit = useCallback(() => onSubmit(value), [onSubmit, value])
<MemoizedForm onSubmit={handleSubmit} />

// Bad — passed to a normal component — no effect
const handleClick = useCallback(() => setOpen(true), [])
<Modal onClick={handleClick} />
```

4. React.memo

- Component re-renders with the same props repeatedly.
- Props must be shallow-compare friendly.
- Only when the component is heavy enough to warrant it.

```ts
// Good — heavy component rendered repeatedly in a list
const EventBlock = memo(function EventBlock({ event }: Props) {
  return <div>{event.title}</div>
})

// Bad — simple static component
const Title = memo(function Title({ text }: Props) {
  return <h1>{text}</h1>
})
```

5. Anti-patterns

- Wrapping "just in case"
- Excessive dependencies

---

### State Management Scope

State must be classified by domain responsibility, not by technical convenience.

**1. UI State (local only)**

UI state is ephemeral and scoped to a single component or tightly coupled subtree.

Examples:

- modal open/close
- hover / focus state
- dropdown state
- form input state (unshared)
- tab selection (local UI concern)

```ts
// Good — local UI state
const [isOpen, setIsOpen] = useState(false)
const [hoveredId, setHoveredId] = useState<string | null>(null)
```

UI state must default to `useState` or custom hooks.

Global state usage for UI state is considered overreach.

**2. Domain State (shared application state)**

Domain state represents business meaning shared across multiple boundaries.

Examples:

- authenticated user
- workspace / organization context
- server-fetched entities
- cross-page filters
- persisted application data

```ts
// Good — domain state via global store
const user = useUserStore((s) => s.user)
const workspace = useWorkspaceStore((s) => s.activeWorkspace)
```

Domain state may use centralized state management only when:

- multiple unrelated components depend on it
- persistence or caching is required
- server-state synchronization is involved

**3. Anti-patterns**

UI state in global store

```ts
// Bad
const { isDropdownOpen, setIsDropdownOpen } = useUIStore()
```

Domain state duplicated locally

```ts
// Bad — duplicating shared business state locally
const [user, setUser] = useState(globalUser)
```

**4. Architectural Rule**

Components must not depend on centralized state for pure UI behavior.

Centralized state is reserved for:

- cross-component coordination
- business domain representation
- persistence requirements

All other state must remain local or encapsulated in feature-level hooks.

---

### One Component Per File

One `export default` component per file. Do not export multiple externally-used components from the same file.

```ts
// Good — internal-only sub-component in the same file
function EventTitle({ title }: { title: string }) {
  return <span>{title}</span>
}

export default function EventBlock({ event }: Props) {
  return <div><EventTitle title={event.title} /></div>
}

// Bad — multiple externally-used components exported from one file
export function EventBlock() { ... }
export function EventTitle() { ... }
```
