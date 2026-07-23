using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocsigRecipient
{
    public Guid DocsigrcId { get; set; }

    public Guid DocsigrcRequestId { get; set; }

    public string DocsigrcRoleCode { get; set; } = null!;

    public Guid? DocsigrcOrgId { get; set; }

    public string DocsigrcRecipientName { get; set; } = null!;

    public string? DocsigrcRecipientEmail { get; set; }

    public string? DocsigrcRecipientPhone { get; set; }

    public string? DocsigrcRecipientTitle { get; set; }

    public int DocsigrcSigningOrder { get; set; }

    public string DocsigrcStatusCode { get; set; } = null!;

    public string? DocsigrcAccessTokenHashSha256 { get; set; }

    public DateTime? DocsigrcSentAt { get; set; }

    public DateTime? DocsigrcViewedAt { get; set; }

    public DateTime? DocsigrcSignedAt { get; set; }

    public DateTime? DocsigrcDeclinedAt { get; set; }

    public string? DocsigrcDeclineReason { get; set; }

    public string DocsigrcMetadataJson { get; set; } = null!;

    public DateTime DocsigrcCreatedAt { get; set; }

    public virtual ICollection<DocsigEvent> DocsigEvents { get; set; } = new List<DocsigEvent>();

    public virtual ICollection<DocsigField> DocsigFields { get; set; } = new List<DocsigField>();

    public virtual OrgMaster? DocsigrcOrg { get; set; }

    public virtual DocsigRequest DocsigrcRequest { get; set; } = null!;

    public virtual SysDocumentSignatureRecipientRole DocsigrcRoleCodeNavigation { get; set; } = null!;

    public virtual SysDocumentSignatureStatus DocsigrcStatusCodeNavigation { get; set; } = null!;
}
