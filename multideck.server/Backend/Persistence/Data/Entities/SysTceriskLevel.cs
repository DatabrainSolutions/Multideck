using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysTceriskLevel
{
    public string TceriskLevelCode { get; set; } = null!;

    public string TceriskLevelName { get; set; } = null!;

    public string? TceriskLevelDescription { get; set; }

    public int TceriskLevelWeight { get; set; }

    public bool TceriskLevelIsActive { get; set; }

    public int TceriskLevelSortOrder { get; set; }

    public virtual ICollection<TceAiinsight> TceAiinsights { get; set; } = new List<TceAiinsight>();

    public virtual ICollection<TceComplianceCase> TceComplianceCases { get; set; } = new List<TceComplianceCase>();

    public virtual ICollection<TceComplianceCheckItem> TceComplianceCheckItems { get; set; } = new List<TceComplianceCheckItem>();

    public virtual ICollection<TceCountryControlRule> TceCountryControlRules { get; set; } = new List<TceCountryControlRule>();

    public virtual ICollection<TceProductControlRule> TceProductControlRules { get; set; } = new List<TceProductControlRule>();

    public virtual ICollection<TceScreeningMatch> TceScreeningMatches { get; set; } = new List<TceScreeningMatch>();

    public virtual ICollection<TceScreeningRun> TceScreeningRuns { get; set; } = new List<TceScreeningRun>();

    public virtual ICollection<TceWatchlistEntry> TceWatchlistEntries { get; set; } = new List<TceWatchlistEntry>();
}
