using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceFtaagreement
{
    public Guid TceftaId { get; set; }

    public string TceftaCode { get; set; } = null!;

    public string TceftaName { get; set; } = null!;

    public string TceftaPartyCountriesJson { get; set; } = null!;

    public DateOnly? TceftaEffectiveFrom { get; set; }

    public DateOnly? TceftaEffectiveTo { get; set; }

    public bool TceftaIsActive { get; set; }

    public string? TceftaNotes { get; set; }

    public DateTime TceftaCreatedAt { get; set; }

    public virtual ICollection<TceOriginRule> TceOriginRules { get; set; } = new List<TceOriginRule>();

    public virtual ICollection<TcePreferenceClaim> TcePreferenceClaims { get; set; } = new List<TcePreferenceClaim>();
}
