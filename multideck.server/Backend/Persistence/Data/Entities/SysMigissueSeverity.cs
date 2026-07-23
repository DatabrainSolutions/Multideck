using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysMigissueSeverity
{
    public string MigissueSeverityCode { get; set; } = null!;

    public string MigissueSeverityName { get; set; } = null!;

    public string? MigissueSeverityDescription { get; set; }

    public bool MigissueSeverityBlocksLoad { get; set; }

    public int MigissueSeverityRank { get; set; }

    public bool MigissueSeverityIsActive { get; set; }

    public virtual ICollection<MigValidationIssue> MigValidationIssues { get; set; } = new List<MigValidationIssue>();
}
