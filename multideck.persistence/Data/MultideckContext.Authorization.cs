using Microsoft.EntityFrameworkCore;
using Multideck.Persistence.Entities;

namespace Multideck.Persistence;

public partial class MultideckContext
{
    public virtual DbSet<SysPermission> SysPermissions { get; set; }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<SysPermission>(entity =>
        {
            entity.HasKey(e => e.SysPermissionId);

            entity.ToTable("sys_Permissions");

            entity.HasIndex(e => e.SysPermissionValue)
                .IsUnique()
                .HasDatabaseName("UX_sys_Permissions_Value");

            entity.Property(e => e.SysPermissionId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("sys_Permission_ID");
            entity.Property(e => e.SysPermissionValue)
                .HasMaxLength(120)
                .HasColumnName("sys_Permission_Value");
            entity.Property(e => e.SysPermissionGroup)
                .HasMaxLength(50)
                .HasColumnName("sys_Permission_Group");
            entity.Property(e => e.SysPermissionName)
                .HasMaxLength(100)
                .HasColumnName("sys_Permission_Name");
            entity.Property(e => e.SysPermissionDescription)
                .HasMaxLength(500)
                .HasColumnName("sys_Permission_Description");
            entity.Property(e => e.SysPermissionIsDangerous)
                .HasDefaultValue(false)
                .HasColumnName("sys_Permission_IsDangerous");
            entity.Property(e => e.SysPermissionCreatedAtUtc)
                .HasDefaultValueSql("now()")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("sys_Permission_CreatedAtUtc");

            entity.HasMany(d => d.Roles).WithMany(p => p.Permissions)
                .UsingEntity<Dictionary<string, object>>(
                    "SysUserRolePermission",
                    r => r.HasOne<SysUserRole>().WithMany()
                        .HasForeignKey("SysUserRoleId")
                        .OnDelete(DeleteBehavior.ClientSetNull)
                        .HasConstraintName("FK_sys_UserRole_Permissions_sys_UserRoles"),
                    l => l.HasOne<SysPermission>().WithMany()
                        .HasForeignKey("SysPermissionId")
                        .OnDelete(DeleteBehavior.ClientSetNull)
                        .HasConstraintName("FK_sys_UserRole_Permissions_sys_Permissions"),
                    j =>
                    {
                        j.HasKey("SysUserRoleId", "SysPermissionId");
                        j.ToTable("sys_UserRole_Permissions");
                        j.IndexerProperty<Guid>("SysUserRoleId").HasColumnName("sys_UserRole_ID");
                        j.IndexerProperty<Guid>("SysPermissionId").HasColumnName("sys_Permission_ID");
                    });
        });
    }
}
