-- 0001: extensions and enums (Milestone 1)

create extension if not exists pgcrypto with schema extensions;

create type public.user_role as enum ('driver', 'carrier', 'admin');
create type public.account_status as enum ('pending', 'approved', 'blocked');
create type public.operator_type as enum ('cdl_driver', 'yard_spotter', 'mechanic');
create type public.cdl_class as enum ('A', 'B', 'C', 'none');
create type public.endorsement as enum ('H', 'N', 'P', 'S', 'T', 'X');
create type public.availability_type as enum ('full_time', 'part_time', 'on_call', 'weekends');
create type public.document_type as enum ('cdl_front', 'cdl_back', 'medical_card', 'certification', 'other');
