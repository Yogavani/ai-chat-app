# Cloudflare AI Image API (Fastify)

Use these env variables in backend:

```env
CLOUDFLARE_ACCOUNT_ID=0c30793b04b884911f1ae5c8c40410f2
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
CLOUDFLARE_IMAGE_MODEL=@cf/black-forest-labs/flux-1-schnell
CLOUDFLARE_TEXT_MODEL=@cf/meta/llama-3.1-8b-instruct
```

## 1) Add route: `POST /ai/generate-image`

```js
// routes/ai.route.js (or your existing AI routes file)
module.exports = async function aiRoutes(fastify) {
  fastify.post("/ai/generate-image", async (req, reply) => {
    try {
      const {
        prompt,
        numSteps = 4,
        guidance = 3.5,
        width = 1024,
        height = 1024
      } = req.body || {};

      if (!prompt || typeof prompt !== "string") {
        return reply.code(400).send({ message: "prompt is required" });
      }

      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      const apiToken = process.env.CLOUDFLARE_API_TOKEN;
      const model = process.env.CLOUDFLARE_IMAGE_MODEL || "@cf/black-forest-labs/flux-1-schnell";

      if (!accountId || !apiToken) {
        return reply.code(500).send({ message: "Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN" });
      }

      const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

      const cfResp = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt,
          num_steps: numSteps,
          guidance,
          width,
          height
        })
      });

      const contentType = cfResp.headers.get("content-type") || "";

      if (!cfResp.ok) {
        const errorText = await cfResp.text();
        return reply.code(cfResp.status).send({
          message: "Cloudflare image generation failed",
          details: errorText
        });
      }

      // Most image models return binary image data
      if (contentType.startsWith("image/")) {
        const arrayBuffer = await cfResp.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        return {
          message: "Image generated successfully",
          imageBase64: base64,
          mimeType: contentType
        };
      }

      // Fallback in case model returns JSON
      const data = await cfResp.json();
      return {
        message: "Image generated",
        ...data
      };
    } catch (error) {
      req.log.error(error, "generate-image error");
      return reply.code(500).send({
        message: "Internal server error in generate-image",
        error: error?.message || "unknown"
      });
    }
  });
};
```

## 2) Frontend usage already added

You now have:

- `src/services/aiImageService.ts`

```ts
generateAIImage({ prompt: "A futuristic city at sunset" })
```

Response shape:

```json
{
  "message": "Image generated successfully",
  "imageBase64": "...",
  "mimeType": "image/png"
}
```

## 3) Show generated image in React Native

```tsx
<Image
  source={{ uri: `data:${result.mimeType};base64,${result.imageBase64}` }}
  style={{ width: 280, height: 280, borderRadius: 12 }}
/>
```

## Notes

- Do **not** call Cloudflare directly from mobile app with API token.
- Keep token only in backend env.
- If prompt volume is high, add rate-limit on `/ai/generate-image`.
