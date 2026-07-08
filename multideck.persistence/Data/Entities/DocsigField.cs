using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocsigField
{
    public Guid DocsigfId { get; set; }

    public Guid DocsigfRequestId { get; set; }

    public Guid? DocsigfRecipientId { get; set; }

    public string DocsigfFieldTypeCode { get; set; } = null!;

    public string? DocsigfLabel { get; set; }

    public int DocsigfPageNo { get; set; }

    public decimal DocsigfX { get; set; }

    public decimal DocsigfY { get; set; }

    public decimal DocsigfWidth { get; set; }

    public decimal DocsigfHeight { get; set; }

    public bool DocsigfIsRequired { get; set; }

    public string? DocsigfValueSnapshot { get; set; }

    public DateTime? DocsigfSignedAt { get; set; }

    public string DocsigfMetadataJson { get; set; } = null!;

    public DateTime DocsigfCreatedAt { get; set; }

    public virtual SysDocumentSignatureFieldType DocsigfFieldTypeCodeNavigation { get; set; } = null!;

    public virtual DocsigRecipient? DocsigfRecipient { get; set; }

    public virtual DocsigRequest DocsigfRequest { get; set; } = null!;
}
