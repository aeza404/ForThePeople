# Linksy demo

A local web demo for Linksy’s social discovery flow. The included people, activities, availability, and invitation responses are fictional sample data. Approving a plan changes only local demo state; it never sends a real invitation or books anything.

## Run locally

```sh
npm start
```

Open `http://localhost:4173`.

The demo works without credentials using the sample interpreter and deterministic match rules. To enable request interpretation with the OpenAI Responses API, set `OPENAI_API_KEY` in the server’s environment before starting it. Keep the key server-side and out of browser code, chat, and source control. Optionally set `OPENAI_MODEL` to a model available to your API project; it defaults to `gpt-6-astra`.

## Included journeys

- Oakland Saturday pickleball partner
- Oakland small group hike
- Chicago visitor coffee meetup
- Honest no-match response
- Approval, decline, and invitation response states

Matching and consent are enforced by the server’s deterministic sample rules. The model extracts request intent and does not choose profiles, create inventory, or take external actions.
