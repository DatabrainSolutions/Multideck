using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceOpenMatch
{
    public Guid? TcematchId { get; set; }

    public Guid? TcematchRunId { get; set; }

    public string? TcerunNumber { get; set; }

    public Guid? TcematchSubjectId { get; set; }

    public string? TcesubjectRoleCode { get; set; }

    public string? TcesubjectEntityTypeCode { get; set; }

    public string? TcesubjectName { get; set; }

    public string? TcesubjectCountryCode { get; set; }

    public Guid? TcematchEntryId { get; set; }

    public string? TceentryPrimaryName { get; set; }

    public string? TceentryProgramCode { get; set; }

    public string? TceentryRegimeName { get; set; }

    public string? TcesourceName { get; set; }

    public string? TcematchListTypeCode { get; set; }

    public string? TcematchStatusCode { get; set; }

    public string? TcematchStrengthCode { get; set; }

    public string? TcematchRiskLevelCode { get; set; }

    public decimal? TcematchScore { get; set; }

    public string? TcematchMatchReason { get; set; }

    public Guid? TcematchCaseId { get; set; }

    public DateTime? TcematchCreatedAt { get; set; }
}
