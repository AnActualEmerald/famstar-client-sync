set dotenv-load

run:
	deno run -A app.ts

debug: 
	docker-compose -f docker-compose.debug.yml up -d