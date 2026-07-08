using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceWatchlistEntry
{
    public Guid TceentryId { get; set; }

    public Guid TceentrySourceId { get; set; }

    public Guid? TceentrySourceFileId { get; set; }

    public string? TceentryExternalId { get; set; }

    public string TceentryListTypeCode { get; set; } = null!;

    public string TceentryEntityTypeCode { get; set; } = null!;

    public string TceentryPrimaryName { get; set; } = null!;

    public string? TceentryNormalizedName { get; set; }

    public string? TceentryProgramCode { get; set; }

    public string? TceentryRegimeName { get; set; }

    public string? TceentryJurisdictionCode { get; set; }

    public string? TceentryCountryCode { get; set; }

    public DateOnly? TceentryDateListed { get; set; }

    public DateOnly? TceentryDateUpdated { get; set; }

    public DateOnly? TceentryDateRemoved { get; set; }

    public bool TceentryIsActive { get; set; }

    public bool TceentryIsArchived { get; set; }

    public string TceentryRiskLevelCode { get; set; } = null!;

    public string? TceentryNotes { get; set; }

    public string TceentryRawJson { get; set; } = null!;

    public DateTime TceentryCreatedAt { get; set; }

    public DateTime TceentryUpdatedAt { get; set; }

    public virtual ICollection<TceScreeningMatch> TceScreeningMatches { get; set; } = new List<TceScreeningMatch>();

    public virtual ICollection<TceWatchlistAddress> TceWatchlistAddresses { get; set; } = new List<TceWatchlistAddress>();

    public virtual ICollection<TceWatchlistAlias> TceWatchlistAliases { get; set; } = new List<TceWatchlistAlias>();

    public virtual ICollection<TceWatchlistIdentifier> TceWatchlistIdentifiers { get; set; } = new List<TceWatchlistIdentifier>();

    public virtual ICollection<TceWhitelist> TceWhitelists { get; set; } = new List<TceWhitelist>();

    public virtual SysTceentityType TceentryEntityTypeCodeNavigation { get; set; } = null!;

    public virtual SysTcelistType TceentryListTypeCodeNavigation { get; set; } = null!;

    public virtual SysTceriskLevel TceentryRiskLevelCodeNavigation { get; set; } = null!;

    public virtual TceDataSource TceentrySource { get; set; } = null!;

    public virtual TceSourceFile? TceentrySourceFile { get; set; }
}
