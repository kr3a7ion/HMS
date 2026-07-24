import { app } from "./app.js";

const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;
app.listen(PORT, () => {
  console.log(`[nexura-central-server] listening on http://localhost:${PORT}`);
});
