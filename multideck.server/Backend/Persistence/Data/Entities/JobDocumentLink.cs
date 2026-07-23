using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobDocumentLink
{
    public Guid JobDocLinkId { get; set; }

    public Guid JobDocLinkJobDocumentId { get; set; }

    public string JobDocLinkLinkType { get; set; } = null!;

    public string JobDocLinkTargetTable { get; set; } = null!;

    public Guid JobDocLinkTargetId { get; set; }

    public string? JobDocLinkRole { get; set; }

    public string? JobDocLinkNotes { get; set; }

    public DateTime JobDocLinkCreatedAt { get; set; }

    public Guid? JobDocLinkCreatedBy { get; set; }

    public virtual JobDocument JobDocLinkJobDocument { get; set; } = null!;

    public virtual SysJobDocumentLinkType JobDocLinkLinkTypeNavigation { get; set; } = null!;
}
