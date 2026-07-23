using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysDocumentSecurityRiskLevel
{
    public string DocsecrlCode { get; set; } = null!;

    public string DocsecrlName { get; set; } = null!;

    public int DocsecrlSortOrder { get; set; }

    public bool DocsecrlIsBlocking { get; set; }

    public bool DocsecrlIsActive { get; set; }

    public DateTime DocsecrlCreatedAt { get; set; }

    public virtual ICollection<DocsecVerificationEvent> DocsecVerificationEvents { get; set; } = new List<DocsecVerificationEvent>();

    public virtual ICollection<DocsecVerificationIssue> DocsecVerificationIssues { get; set; } = new List<DocsecVerificationIssue>();
}
