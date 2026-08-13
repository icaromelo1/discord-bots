import { MigrationInterface, QueryRunner } from "typeorm";

export class EstruturaInicial1786657222967 implements MigrationInterface {
    name = 'EstruturaInicial1786657222967'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "tracks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "youtube_id" text NOT NULL, "title" text NOT NULL, "duration_sec" integer NOT NULL, "drive_file" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_d18cd8ada8349cdb23656718028" UNIQUE ("youtube_id"), CONSTRAINT "PK_242a37ffc7870380f0e611986e8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "guild_tracks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "guild_id" text NOT NULL, "track_id" uuid NOT NULL, "added_by" text NOT NULL, "added_by_name" text NOT NULL, "first_added_at" TIMESTAMP WITH TIME ZONE NOT NULL, "last_played_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_d5cebad0035ddc7bc1cfd30e3ed" UNIQUE ("guild_id", "track_id"), CONSTRAINT "PK_ac0967bda6f7315e5121fd938b5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "guild_tracks" ADD CONSTRAINT "FK_135922bf0c1dd69d081c795b447" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "guild_tracks" DROP CONSTRAINT "FK_135922bf0c1dd69d081c795b447"`);
        await queryRunner.query(`DROP TABLE "guild_tracks"`);
        await queryRunner.query(`DROP TABLE "tracks"`);
    }

}
