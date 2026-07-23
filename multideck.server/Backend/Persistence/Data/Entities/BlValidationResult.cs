using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class BlValidationResult
{
    public Guid BlvrId { get; set; }

    public Guid BlvrBlId { get; set; }

    public string BlvrValidatorName { get; set; } = null!;

    public string? BlvrValidatorVersion { get; set; }

    public DateTime BlvrValidatedAt { get; set; }

    public bool BlvrIsValid { get; set; }

    public int BlvrErrorCount { get; set; }

    public int BlvrWarningCount { get; set; }

    public string BlvrResultPayload { get; set; } = null!;

    public virtual BlHeader BlvrBl { get; set; } = null!;
}
