using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CdsLocation
{
    public Guid CdslId { get; set; }

    public Guid CdslCdsid { get; set; }

    public string CdslLocationRole { get; set; } = null!;

    public string? CdslLocationCode { get; set; }

    public string? CdslUnlocodesnapshot { get; set; }

    public string? CdslNameSnapshot { get; set; }

    public string? CdslCountryCodeSnapshot { get; set; }

    public string CdslAddressJson { get; set; } = null!;

    public DateTime CdslCreatedAt { get; set; }

    public virtual CdsDeclaration CdslCds { get; set; } = null!;
}
