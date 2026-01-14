import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/db/schema.ts',
	out: './drizzle',
	dialect: 'mysql',
	dbCredentials: {
	    host: 'localhost',
	    port: 3306,
	    user: 'user',
	    password: 'user_password',
	    database: 'drawing_service_db',
	},
});
