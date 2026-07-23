using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CdsValidationResult
{
    public Guid CdsvrId { get; set; }

    public Guid CdsvrCdsid { get; set; }

    public Guid? CdsvrCdsitemId { get; set; }

    public string CdsvrValidationScope { get; set; } = null!;

    public string? CdsvrValidationSource { get; set; }

    public string CdsvrResult { get; set; } = null!;

    public string? CdsvrCode { get; set; }

    public string? CdsvrMessage { get; set; }

    public string CdsvrDetail { get; set; } = null!;

    public DateTime CdsvrValidatedAt { get; set; }

    public Guid? CdsvrValidatedBy { get; set; }

    public virtual CdsDeclaration CdsvrCds { get; set; } = null!;

    public virtual CdsItem? CdsvrCdsitem { get; set; }
}
