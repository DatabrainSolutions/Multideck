using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysDocumentSignatureStatus
{
    public string DocsigsCode { get; set; } = null!;

    public string DocsigsName { get; set; } = null!;

    public bool DocsigsIsFinal { get; set; }

    public bool DocsigsIsSuccessful { get; set; }

    public int DocsigsSortOrder { get; set; }

    public bool DocsigsIsActive { get; set; }

    public DateTime DocsigsCreatedAt { get; set; }

    public virtual ICollection<DocsigEvent> DocsigEvents { get; set; } = new List<DocsigEvent>();

    public virtual ICollection<DocsigRecipient> DocsigRecipients { get; set; } = new List<DocsigRecipient>();

    public virtual ICollection<DocsigRequest> DocsigRequests { get; set; } = new List<DocsigRequest>();
}
