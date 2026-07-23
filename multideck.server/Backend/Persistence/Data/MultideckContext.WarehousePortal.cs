using Microsoft.EntityFrameworkCore;
using Multideck.Persistence.Entities;

namespace Multideck.Persistence;

public partial class MultideckContext
{
    public DbSet<WmsCustomerFacilityAccess> WmsCustomerFacilityAccesses => Set<WmsCustomerFacilityAccess>();

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder)
    {
        ConfigureDocumentStorage(modelBuilder);
        modelBuilder.Entity<WmsCustomerFacilityAccess>(entity =>
        {
            entity.HasKey(value => value.WmscustomerFacilityAccessId);
            entity.ToTable("WMS_CustomerFacilityAccess");
            entity.HasIndex(value => new
            {
                value.WmscustomerFacilityAccessCustomerOrgId,
                value.WmscustomerFacilityAccessFacilityId,
            }).IsUnique();

            entity.Property(value => value.WmscustomerFacilityAccessId)
                .HasColumnName("WMSCustomerFacilityAccess_ID")
                .HasDefaultValueSql("gen_random_uuid()");
            entity.Property(value => value.WmscustomerFacilityAccessCustomerOrgId)
                .HasColumnName("WMSCustomerFacilityAccess_CustomerOrgID");
            entity.Property(value => value.WmscustomerFacilityAccessFacilityId)
                .HasColumnName("WMSCustomerFacilityAccess_FacilityID");
            entity.Property(value => value.WmscustomerFacilityAccessIsActive)
                .HasColumnName("WMSCustomerFacilityAccess_IsActive")
                .HasDefaultValue(true);
            entity.Property(value => value.WmscustomerFacilityAccessCreatedAt)
                .HasColumnName("WMSCustomerFacilityAccess_CreatedAt")
                .HasDefaultValueSql("now()");
            entity.Property(value => value.WmscustomerFacilityAccessCreatedBy)
                .HasColumnName("WMSCustomerFacilityAccess_CreatedBy");
            entity.Property(value => value.WmscustomerFacilityAccessUpdatedAt)
                .HasColumnName("WMSCustomerFacilityAccess_UpdatedAt")
                .HasDefaultValueSql("now()");

            entity.HasOne(value => value.WmscustomerFacilityAccessCustomerOrg)
                .WithMany()
                .HasForeignKey(value => value.WmscustomerFacilityAccessCustomerOrgId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(value => value.WmscustomerFacilityAccessFacility)
                .WithMany()
                .HasForeignKey(value => value.WmscustomerFacilityAccessFacilityId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(value => value.WmscustomerFacilityAccessCreatedByNavigation)
                .WithMany()
                .HasForeignKey(value => value.WmscustomerFacilityAccessCreatedBy)
                .OnDelete(DeleteBehavior.SetNull);
        });
    }
}
