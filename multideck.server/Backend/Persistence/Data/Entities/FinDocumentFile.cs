using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinDocumentFile
{
    public Guid FindocFileId { get; set; }

    public Guid FindocFileDocumentId { get; set; }

    public string FindocFileFileTypeCode { get; set; } = null!;

    public string FindocFileFileName { get; set; } = null!;

    public string? FindocFileFilePath { get; set; }

    public Guid? FindocFileDocBuilderGeneratedId { get; set; }

    public Guid? FindocFileJobDocumentId { get; set; }

    public string? FindocFileFileHashSha256 { get; set; }

    public bool FindocFileIsCustomerVisible { get; set; }

    public DateTime FindocFileCreatedAt { get; set; }

    public Guid? FindocFileCreatedBy { get; set; }

    public virtual CmpUser? FindocFileCreatedByNavigation { get; set; }

    public virtual FinDocument FindocFileDocument { get; set; } = null!;
}
