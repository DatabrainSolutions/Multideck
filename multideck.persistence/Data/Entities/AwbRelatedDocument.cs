using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// Links between MAWB/HAWB records and other supporting or replacement documents.
/// </summary>
public partial class AwbRelatedDocument
{
    public Guid AwbrdId { get; set; }

    public Guid AwbrdAwbid { get; set; }

    public Guid? AwbrdRelatedAwbid { get; set; }

    public string AwbrdRelationshipType { get; set; } = null!;

    public string? AwbrdRelatedDocumentNumber { get; set; }

    public string? AwbrdRelatedDocumentType { get; set; }

    public string? AwbrdDescription { get; set; }

    public string? AwbrdSource { get; set; }

    public DateTime AwbrdCreatedAt { get; set; }

    public Guid? AwbrdJobDocumentId { get; set; }

    public virtual AwbHeader AwbrdAwb { get; set; } = null!;

    public virtual JobDocument? AwbrdJobDocument { get; set; }

    public virtual AwbHeader? AwbrdRelatedAwb { get; set; }
}
