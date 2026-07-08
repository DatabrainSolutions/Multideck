using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceDataSource
{
    public Guid TcesourceId { get; set; }

    public string TcesourceCode { get; set; } = null!;

    public string TcesourceName { get; set; } = null!;

    public string TcesourceSourceTypeCode { get; set; } = null!;

    public string TcesourceListTypeCode { get; set; } = null!;

    public string TcesourceStatusCode { get; set; } = null!;

    public string? TcesourceJurisdictionCode { get; set; }

    public string? TcesourceRegionCode { get; set; }

    public bool TcesourceIsOfficial { get; set; }

    public bool TcesourceIsCommercial { get; set; }

    public string? TcesourceProviderName { get; set; }

    public string? TcesourceApibaseUrl { get; set; }

    public string? TcesourceDownloadUrl { get; set; }

    public string? TcesourceSecretRef { get; set; }

    public string? TcesourceLicenseNotes { get; set; }

    public int? TcesourceRefreshFrequencyMinutes { get; set; }

    public DateTime? TcesourceLastRefreshAt { get; set; }

    public DateTime? TcesourceNextRefreshAt { get; set; }

    public string TcesourceSettingsJson { get; set; } = null!;

    public DateTime TcesourceCreatedAt { get; set; }

    public Guid? TcesourceCreatedBy { get; set; }

    public DateTime TcesourceUpdatedAt { get; set; }

    public Guid? TcesourceUpdatedBy { get; set; }

    public virtual ICollection<TcePolicySource> TcePolicySources { get; set; } = new List<TcePolicySource>();

    public virtual ICollection<TceScreeningMatch> TceScreeningMatches { get; set; } = new List<TceScreeningMatch>();

    public virtual ICollection<TceSourceFile> TceSourceFiles { get; set; } = new List<TceSourceFile>();

    public virtual ICollection<TceWatchlistEntry> TceWatchlistEntries { get; set; } = new List<TceWatchlistEntry>();

    public virtual ICollection<TceWhitelist> TceWhitelists { get; set; } = new List<TceWhitelist>();

    public virtual CmpUser? TcesourceCreatedByNavigation { get; set; }

    public virtual SysTcelistType TcesourceListTypeCodeNavigation { get; set; } = null!;

    public virtual SysTcesourceType TcesourceSourceTypeCodeNavigation { get; set; } = null!;

    public virtual SysTcesourceStatus TcesourceStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? TcesourceUpdatedByNavigation { get; set; }
}
