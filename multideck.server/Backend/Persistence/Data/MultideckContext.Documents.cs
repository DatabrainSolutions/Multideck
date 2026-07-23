using Microsoft.EntityFrameworkCore;
using Multideck.Persistence.Entities;

namespace Multideck.Persistence;

public partial class MultideckContext
{
    public DbSet<DocStoredObject> DocStoredObjects => Set<DocStoredObject>();

    private static void ConfigureDocumentStorage(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<DocStoredObject>(entity =>
        {
            entity.HasKey(value => value.DocStoredObjectId);
            entity.ToTable("DOC_StoredObjects");
            entity.HasIndex(value => new { value.DocStoredObjectContainer, value.DocStoredObjectBlobName }).IsUnique();
            entity.HasIndex(value => new { value.DocStoredObjectConcernCode, value.DocStoredObjectOrganisationId, value.DocStoredObjectAggregateType, value.DocStoredObjectAggregateId });
            entity.HasIndex(value => value.DocStoredObjectSha256);

            entity.Property(value => value.DocStoredObjectId).HasColumnName("DOCStoredObject_ID").HasDefaultValueSql("gen_random_uuid()");
            entity.Property(value => value.DocStoredObjectConcernCode).HasColumnName("DOCStoredObject_ConcernCode").HasMaxLength(40);
            entity.Property(value => value.DocStoredObjectOrganisationId).HasColumnName("DOCStoredObject_OrganisationID");
            entity.Property(value => value.DocStoredObjectAggregateType).HasColumnName("DOCStoredObject_AggregateType").HasMaxLength(80);
            entity.Property(value => value.DocStoredObjectAggregateId).HasColumnName("DOCStoredObject_AggregateID");
            entity.Property(value => value.DocStoredObjectProviderCode).HasColumnName("DOCStoredObject_ProviderCode").HasMaxLength(40).HasDefaultValue("supabase_storage");
            entity.Property(value => value.DocStoredObjectContainer).HasColumnName("DOCStoredObject_Container").HasMaxLength(63);
            entity.Property(value => value.DocStoredObjectBlobName).HasColumnName("DOCStoredObject_BlobName").HasMaxLength(1024);
            entity.Property(value => value.DocStoredObjectOriginalFileName).HasColumnName("DOCStoredObject_OriginalFileName").HasMaxLength(255);
            entity.Property(value => value.DocStoredObjectMimeType).HasColumnName("DOCStoredObject_MimeType").HasMaxLength(160);
            entity.Property(value => value.DocStoredObjectFileSizeBytes).HasColumnName("DOCStoredObject_FileSizeBytes");
            entity.Property(value => value.DocStoredObjectSha256).HasColumnName("DOCStoredObject_SHA256").HasMaxLength(64);
            entity.Property(value => value.DocStoredObjectEtag).HasColumnName("DOCStoredObject_ETag").HasMaxLength(160);
            entity.Property(value => value.DocStoredObjectVersionId).HasColumnName("DOCStoredObject_VersionID").HasMaxLength(160);
            entity.Property(value => value.DocStoredObjectStatusCode).HasColumnName("DOCStoredObject_StatusCode").HasMaxLength(40).HasDefaultValue("active");
            entity.Property(value => value.DocStoredObjectCreatedAt).HasColumnName("DOCStoredObject_CreatedAt").HasDefaultValueSql("now()");
            entity.Property(value => value.DocStoredObjectCreatedBy).HasColumnName("DOCStoredObject_CreatedBy");
            entity.Property(value => value.DocStoredObjectCreatedByPortalUserId).HasColumnName("DOCStoredObject_CreatedByPortalUserID");
            entity.Property(value => value.DocStoredObjectDeletedAt).HasColumnName("DOCStoredObject_DeletedAt");
            entity.Property(value => value.DocStoredObjectDeletedBy).HasColumnName("DOCStoredObject_DeletedBy");

            entity.HasOne(value => value.DocStoredObjectOrganisation).WithMany().HasForeignKey(value => value.DocStoredObjectOrganisationId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(value => value.DocStoredObjectCreatedByNavigation).WithMany().HasForeignKey(value => value.DocStoredObjectCreatedBy).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(value => value.DocStoredObjectCreatedByPortalUser).WithMany().HasForeignKey(value => value.DocStoredObjectCreatedByPortalUserId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(value => value.DocStoredObjectDeletedByNavigation).WithMany().HasForeignKey(value => value.DocStoredObjectDeletedBy).OnDelete(DeleteBehavior.SetNull);
        });
    }
}
