using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysDocumentSignatureRecipientRole
{
    public string DocsigrrCode { get; set; } = null!;

    public string DocsigrrName { get; set; } = null!;

    public string? DocsigrrDescription { get; set; }

    public int DocsigrrSortOrder { get; set; }

    public bool DocsigrrIsActive { get; set; }

    public DateTime DocsigrrCreatedAt { get; set; }

    public virtual ICollection<DocsigRecipient> DocsigRecipients { get; set; } = new List<DocsigRecipient>();
}
