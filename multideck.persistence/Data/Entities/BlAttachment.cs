using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class BlAttachment
{
    public Guid BlaId { get; set; }

    public Guid BlaBlId { get; set; }

    public string BlaAttachmentType { get; set; } = null!;

    public string BlaFileName { get; set; } = null!;

    public string? BlaStorageBucket { get; set; }

    public string? BlaStoragePath { get; set; }

    public string? BlaMimeType { get; set; }

    public long? BlaFileSizeBytes { get; set; }

    public string? BlaSha256 { get; set; }

    public int BlaVersionNo { get; set; }

    public DateTime BlaCreatedAt { get; set; }

    public Guid? BlaCreatedBy { get; set; }

    public Guid? BlaJobDocumentId { get; set; }

    public virtual BlHeader BlaBl { get; set; } = null!;

    public virtual JobDocument? BlaJobDocument { get; set; }
}
