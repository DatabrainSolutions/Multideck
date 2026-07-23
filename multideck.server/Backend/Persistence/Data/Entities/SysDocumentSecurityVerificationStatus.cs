using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysDocumentSecurityVerificationStatus
{
    public string DocsecvsCode { get; set; } = null!;

    public string DocsecvsName { get; set; } = null!;

    public bool DocsecvsIsPositive { get; set; }

    public string? DocsecvsRiskLevelCode { get; set; }

    public int DocsecvsSortOrder { get; set; }

    public bool DocsecvsIsActive { get; set; }

    public DateTime DocsecvsCreatedAt { get; set; }

    public virtual ICollection<DocsecVerificationEvent> DocsecVerificationEvents { get; set; } = new List<DocsecVerificationEvent>();
}
