using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SecUserOfficeAccessSummary
{
    public Guid? UserId { get; set; }

    public Guid? OrgOfficeId { get; set; }

    public string? OfficeCode { get; set; }

    public string? OfficeName { get; set; }

    public string? StatusCode { get; set; }

    public bool? IsDefault { get; set; }

    public bool? CanView { get; set; }

    public bool? CanCreateJobs { get; set; }

    public bool? CanApprove { get; set; }
}
