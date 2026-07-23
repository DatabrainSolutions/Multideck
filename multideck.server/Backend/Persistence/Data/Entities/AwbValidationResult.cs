using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// AWB validation outcomes from internal checks, Cargo-XML validation, IATA AutoCheck, or carrier responses.
/// </summary>
public partial class AwbValidationResult
{
    public Guid AwbvrId { get; set; }

    public Guid AwbvrAwbid { get; set; }

    public string AwbvrValidationScope { get; set; } = null!;

    public string? AwbvrValidationSource { get; set; }

    public string AwbvrResult { get; set; } = null!;

    public string? AwbvrCode { get; set; }

    public string? AwbvrMessage { get; set; }

    public string AwbvrDetail { get; set; } = null!;

    public DateTime AwbvrValidatedAt { get; set; }

    public Guid? AwbvrValidatedBy { get; set; }

    public virtual AwbHeader AwbvrAwb { get; set; } = null!;
}
