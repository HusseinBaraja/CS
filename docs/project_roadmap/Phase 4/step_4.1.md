## Phase 4: AI Provider System
### Step 4.1: Provider Interface & Types
**Goal**: Define the pluggable AI provider contract.

**Tasks**:
- [ ] Create `src/providers/types.ts`:

```typescript
  interface AIProvider {
  readonly name: string;
  readonly model: string;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  isAvailable(): Promise<boolean>;
  }

  interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  }

  interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  }

  interface ChatResponse {
  content: string;
  usage?: { promptTokens: number; completionTokens: number };
  provider: string;
  }
```


**Verification**:
- Types compile without errors
- Interface is importable from anywhere
