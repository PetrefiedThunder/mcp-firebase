# mcp-firebase

Read, write, and list Firestore documents and collections via the REST API.

## Tools

| Tool | Description |
|------|-------------|
| `get_document` | Get a Firestore document. |
| `list_documents` | List documents in a collection. |
| `create_document` | Create a Firestore document. |
| `delete_document` | Delete a Firestore document. |
| `list_collections` | List root collections (subcollection discovery). |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREBASE_PROJECT_ID` | Yes | Firebase project ID |
| `FIREBASE_API_KEY` | No | Firebase Web API key |

## Installation

```bash
git clone https://github.com/PetrefiedThunder/mcp-firebase.git
cd mcp-firebase
npm install
npm run build
```

## Usage with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "firebase": {
      "command": "node",
      "args": ["/path/to/mcp-firebase/dist/index.js"],
      "env": {
        "FIREBASE_PROJECT_ID": "your-firebase-project-id",
        "FIREBASE_API_KEY": "your-firebase-api-key"
      }
    }
  }
}
```

## Usage with npx

```bash
npx mcp-firebase
```

## License

MIT
