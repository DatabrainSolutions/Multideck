using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MdxSharedDocument
{
    public Guid MdxdocId { get; set; }

    public Guid MdxdocSharedJobId { get; set; }

    public Guid? MdxdocLocalJobDocumentId { get; set; }

    public string? MdxdocRemoteDocumentId { get; set; }

    public string MdxdocStatusCode { get; set; } = null!;

    public string? MdxdocDocumentTypeCodeSnapshot { get; set; }

    public string MdxdocTitle { get; set; } = null!;

    public DateOnly? MdxdocDocumentDate { get; set; }

    public string? MdxdocFileName { get; set; }

    public string? MdxdocMimeType { get; set; }

    public string? MdxdocFileHashSha256 { get; set; }

    public string? MdxdocPublicVerificationCode { get; set; }

    public string? MdxdocPublicVerificationUrl { get; set; }

    public bool MdxdocIsAvailableToPartner { get; set; }

    public bool MdxdocRequiresReview { get; set; }

    public string MdxdocMetadataJson { get; set; } = null!;

    public DateTime MdxdocUpdatedAt { get; set; }

    public virtual JobDocument? MdxdocLocalJobDocument { get; set; }

    public virtual MdxSharedJob MdxdocSharedJob { get; set; } = null!;

    public virtual SysMdxrecordStatus MdxdocStatusCodeNavigation { get; set; } = null!;
}
