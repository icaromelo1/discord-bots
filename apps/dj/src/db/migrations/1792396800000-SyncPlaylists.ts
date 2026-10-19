import { MigrationInterface, QueryRunner } from "typeorm";

export class SyncPlaylists1792396800000 implements MigrationInterface {
    name = 'SyncPlaylists1792396800000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "account_playlists" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "youtube_playlist_id" text NOT NULL, "title" text NOT NULL, "synced_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "UQ_account_playlists_youtube_playlist_id" UNIQUE ("youtube_playlist_id"), CONSTRAINT "PK_account_playlists" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "account_playlist_items" ("playlist_id" uuid NOT NULL, "position" integer NOT NULL, "youtube_id" text NOT NULL, "title" text NOT NULL, "duration_sec" integer NOT NULL, CONSTRAINT "PK_account_playlist_items" PRIMARY KEY ("playlist_id", "position"))`);
        await queryRunner.query(`CREATE INDEX "IDX_account_playlist_items_youtube_id" ON "account_playlist_items" ("youtube_id")`);
        await queryRunner.query(`ALTER TABLE "account_playlist_items" ADD CONSTRAINT "FK_account_playlist_items_playlist" FOREIGN KEY ("playlist_id") REFERENCES "account_playlists"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`CREATE TABLE "sync_failures" ("youtube_id" text NOT NULL, "kind" text NOT NULL, "message" text NOT NULL, "definitive" boolean NOT NULL, "attempts" integer NOT NULL, "last_attempt_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_sync_failures" PRIMARY KEY ("youtube_id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "sync_failures"`);
        await queryRunner.query(`ALTER TABLE "account_playlist_items" DROP CONSTRAINT "FK_account_playlist_items_playlist"`);
        await queryRunner.query(`DROP INDEX "IDX_account_playlist_items_youtube_id"`);
        await queryRunner.query(`DROP TABLE "account_playlist_items"`);
        await queryRunner.query(`DROP TABLE "account_playlists"`);
    }

}
