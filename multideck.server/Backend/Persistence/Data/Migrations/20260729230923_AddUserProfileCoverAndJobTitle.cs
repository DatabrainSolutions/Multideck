using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Multideck.Persistence.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddUserProfileCoverAndJobTitle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "User_CoverPhotoBucket",
                table: "cmp_Users",
                type: "character varying(63)",
                maxLength: 63,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "User_CoverPhotoMimeType",
                table: "cmp_Users",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "User_CoverPhotoPath",
                table: "cmp_Users",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "User_CoverPhotoSizeBytes",
                table: "cmp_Users",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "User_CoverPhotoUpdatedAt",
                table: "cmp_Users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "User_JobTitle",
                table: "cmp_Users",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_cmp_Users_CoverPhoto",
                table: "cmp_Users",
                sql: """
                      (
                        "User_CoverPhotoBucket" is null
                        and "User_CoverPhotoPath" is null
                        and "User_CoverPhotoMimeType" is null
                        and "User_CoverPhotoSizeBytes" is null
                        and "User_CoverPhotoUpdatedAt" is null
                      )
                      or
                      (
                        "User_CoverPhotoBucket" = 'profile-photos'
                        and "User_CoverPhotoPath" is not null
                        and "User_CoverPhotoMimeType" in ('image/jpeg', 'image/png', 'image/webp')
                        and "User_CoverPhotoSizeBytes" between 1 and 5242880
                        and "User_CoverPhotoUpdatedAt" is not null
                      )
                      """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_cmp_Users_CoverPhoto",
                table: "cmp_Users");

            migrationBuilder.DropColumn(
                name: "User_CoverPhotoBucket",
                table: "cmp_Users");

            migrationBuilder.DropColumn(
                name: "User_CoverPhotoMimeType",
                table: "cmp_Users");

            migrationBuilder.DropColumn(
                name: "User_CoverPhotoPath",
                table: "cmp_Users");

            migrationBuilder.DropColumn(
                name: "User_CoverPhotoSizeBytes",
                table: "cmp_Users");

            migrationBuilder.DropColumn(
                name: "User_CoverPhotoUpdatedAt",
                table: "cmp_Users");

            migrationBuilder.DropColumn(
                name: "User_JobTitle",
                table: "cmp_Users");
        }
    }
}
